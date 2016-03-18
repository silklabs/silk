private let log = DebugLog.create("silk-dashsegment")

/**
 * Stateful machinery to play back video segments provided by device.
 *
 * The main purpose of this component is to prepare video segments from device
 * for video playback by a DASH-capable player. To that end, this keeps track of
 * segment sequence numbers and start times, and it strips the MP4 file header
 * from all segments but the first. For that reason, whenever the player that's
 * used to render the video is re-initialized, this class also needs to be
 * reinstantiated.
 */
public final class DashSegmentPlayback {
  private var segmentSeqno: Int32 = 0
  private var segmentStartTime: Int32 = 0 // relative start time counted in video ticks

  public enum DashSegmentErrors: ErrorType {
    case UnrecognizedFormat
    case InvalidMetadata
  }

  /**
   * Prepare a video segment from device for playback.
   *
   * The data is modified in-place. The NSData that's returned is merely a view onto
   * that data and will not participate in the underlying data's reference counting.
   * So consuming code should always retain a reference to the passed in NSMutableData
   * object for as long as it needs access to the data.
   */
  public func processSegment(data: NSMutableData) throws -> NSData {
    log.debug("processSegment() for segment no. \(self.segmentSeqno)")
    let segment = DashSegment(data: data)
    try segment.rewrite(self.segmentSeqno, startTime: self.segmentStartTime)

    var ret: NSData
    if (self.segmentSeqno == 0) {
      ret = data
    } else {
      // Strip the mp4 header from all subsequent segments.
      let bytes = UnsafeMutablePointer<Void>(data.bytes.advancedBy(Int(segment.videoOffset)))
      ret = NSData(
        bytesNoCopy: bytes,
        length: data.length - Int(segment.videoOffset),
        freeWhenDone: false
      )
    }

    self.segmentSeqno += 1
    self.segmentStartTime += segment.durationTime
    return ret
  }

  /**
   * Helper class that parses and rewrites a segment received from device.
   */
  private class DashSegment {
    private let m4s: NSMutableData
    private var durationTime: Int32 = 0
    private var videoOffset: Int32 = 0
    private var mute: Bool = false

    /**
     * Represents an ISO 14496 box within the MP4 segment.
     *
     * Instances are immutable so the methods below that navigate the box
     * tree within the MP4 segment always return new box instances.
     */
    private class Box {
      static let HEADER_SIZE = 4 /* size */ + 4 /* fourcc */

      let fourcc: String?
      let size: Int32
      let offset: Int32

      init(fourcc: String? = nil, size: Int32 = 0, offset: Int32 = 0) {
        self.fourcc = fourcc
        self.size = size
        self.offset = offset
      }
    }

    /**
     * Possible track header flags (see 'tkhd' box).
     */
    enum TrackFlags: Int32 {
      case TrackEnabled = 1
      case TrackInMovie = 2
      case TrackInPreview = 4
      case TrackInPoster = 8
    }

    /**
     * Track information that we care about.
     *
     * By far not everything we could extract from the 'trak' boxes
     * and its subboxes (e.g. width/height, codec, etc. are all there
     * but we don't need them.)
     */
    private class TrackInfo {
      var id: Int32 = 0
      var timescale: Int32 = 0
      var type: String = ""
    }

    /**
     * Order and names of the Int32 fields that we stash into our proprietary
     * 'Xmta' box inside the 'free' box of each segment.
     */
    static let XMTA_INT32_FIELDS = [
      "seqnoOffset",
      "presentationTimeOffset",
      "videoDecodeTimeOffset",
      "audioDecodeTimeOffset",
      "mute",
    ]

    init(data: NSMutableData) {
      self.m4s = data
    }

    /**
     * Return the box that's immediately following `box`.
     */
    private func findBoxAfter(box: Box) -> Box {
      let offset = box.offset + box.size
      return Box(
        fourcc: readFourccAt(offset + 4),
        size: readInt32BEAt(offset),
        offset: offset
      )
    }

    /**
     * Return the first child box of `box`.
     */
    private func openBox(box: Box) -> Box {
      return findBoxAfter(Box(
        fourcc: nil,
        size: 0,
        offset: box.offset + Box.HEADER_SIZE
      ))
    }

    /**
     * Find a box by its fourcc identifier.
     *
     * `withinBox` restricts the search to immediate child boxes of that box.
     *
     * `afterBox` restricts the search to sibling boxes that come after that box.
     */
    private func findBoxByFourcc(fourcc: String, withinBox: Box? = nil, afterBox: Box? = nil) -> Box? {
      // Ensure that we don't step outside our containing box boundary (if it's
      // specified via the `withinBox` parameter), or the overall data buffer.
      let maxOffset = (withinBox == nil) ?
        Int32(m4s.length) :
        withinBox!.offset + withinBox!.size

      // Determine our starting box.
      var box: Box
      if let after = afterBox {
        if (after.offset + after.size > maxOffset) {
          // `afterBox` is already the last box in this container/buffer.
          return nil
        }
        box = findBoxAfter(after)
      } else if let within = withinBox {
        box = openBox(within)
      } else {
        box = Box()
      }

      var ret: Box? = nil
      repeat {
        if (box.fourcc == fourcc) {
          ret = box
          break
        }
        box = findBoxAfter(box);
      } while box.offset + box.size <= maxOffset
      return ret;
    }

    private func readFourccAt(offset: Int32) -> String {
      var bytes = Array<UInt8>(count: 4, repeatedValue: 0)
      m4s.getBytes(&bytes, range: NSRange(location: Int(offset), length: 4))
      return String(bytes: bytes, encoding: NSASCIIStringEncoding)!
    }

    private func readInt32BEAt(offset: Int32) -> Int32 {
      var value: Int32 = 0
      m4s.getBytes(&value, range: NSRange(location: Int(offset), length: 4))
      return Int32(bigEndian: value)
    }

    private func writeInt32BEAt(offset: Int32, value: Int32) {
      self.m4s.replaceBytesInRange(
        NSRange(location: Int(offset), length: 4),
        withBytes: [value.bigEndian]
      )
    }

    private func readTrackInfo(trakBox: Box) throws -> TrackInfo {
      let trackInfo = TrackInfo()

      guard
        let tkhdBox = findBoxByFourcc("tkhd", withinBox: trakBox)
      else {
        log.debug("Could not find 'tkhd' box")
        throw DashSegmentErrors.UnrecognizedFormat
      }
      let versionFlags = readInt32BEAt(tkhdBox.offset + Box.HEADER_SIZE)
      let version = versionFlags >> 24
      let flags = versionFlags & 0x00ffffff
      guard
        version == 0 &&
        (flags & TrackFlags.TrackEnabled.rawValue) != 0 &&
        (flags & TrackFlags.TrackInMovie.rawValue) != 0
      else {
        log.debug("Unrecognized track version/flags: \(versionFlags)")
        throw DashSegmentErrors.UnrecognizedFormat
      }
      trackInfo.id = readInt32BEAt(
        tkhdBox.offset +
        Box.HEADER_SIZE +
        4 /* version + flags */ +
        4 /* creation time */ +
        4 /* modification time */
      )

      guard
        let mdiaBox = findBoxByFourcc("mdia", withinBox: trakBox),
        let mdhdBox = findBoxByFourcc("mdhd", withinBox: mdiaBox),
        let hdlrBox = findBoxByFourcc("hdlr", withinBox: mdiaBox)
      else {
        log.debug("Could not find 'mdia', 'mdhd', or 'hdlr' boxes")
        throw DashSegmentErrors.UnrecognizedFormat
      }
      trackInfo.timescale = readInt32BEAt(
        mdhdBox.offset +
        Box.HEADER_SIZE +
        4 /* version + flags */ +
        4 /* creation time */ +
        4 /* modification time */
      )
      trackInfo.type = readFourccAt(
        hdlrBox.offset +
        Box.HEADER_SIZE +
        4 /* version + flags */ +
        4 /* quicktime type */
      )

      return trackInfo
    }

    private func readTracks(moovBox: Box) throws -> [TrackInfo] {
      var tracks: [TrackInfo] = []
      var trakBox = findBoxByFourcc("trak", withinBox: moovBox)
      while trakBox != nil {
        tracks.append(try readTrackInfo(trakBox!))
        trakBox = findBoxByFourcc("trak", withinBox: moovBox, afterBox: trakBox)
      }
      return tracks
    }

    private func readStashedMetadata(freeBox: Box) throws -> [String: Int32] {
      let box = findBoxByFourcc("Xmta", withinBox: freeBox)
      if (box == nil) {
        log.debug("Could not find 'Xmta' box")
        throw DashSegmentErrors.InvalidMetadata
      }

      var pos = box!.offset + Box.HEADER_SIZE + 4 /* version + flags */
      var metadata: [String: Int32] = [:]

      for name in DashSegment.XMTA_INT32_FIELDS {
        metadata[name] = self.readInt32BEAt(pos)
        pos += 4
      }
      return metadata;
    }

    private func rewrite(seqno: Int32, startTime: Int32) throws {
      guard
        let moovBox = findBoxByFourcc("moov"),
        let stypBox = findBoxByFourcc("styp"),
        let freeBox = findBoxByFourcc("free", afterBox: stypBox)
      else {
        log.debug("Could not find 'moov', 'styp', or 'free' box")
        throw DashSegmentErrors.UnrecognizedFormat
      }

      // For now we'll only support 1 video and 1 audio track, in that order.
      let tracks = try readTracks(moovBox)
      guard
        tracks.count == 2 &&
        tracks[0].type == "vide" &&
        tracks[1].type == "soun"
      else {
          log.debug(
            "Unexpected: track 0 is of type '\(tracks[0].type)', " +
            "track 1 is of type '\(tracks[1].type)'"
          )
          throw DashSegmentErrors.UnrecognizedFormat
      }
      let videoTimescale = tracks[0].timescale
      let audioTimescale = tracks[1].timescale

      // Rewrite the sequence number and decode times in the segment.
      let metadata = try readStashedMetadata(freeBox)
      guard
        "?seq" == readFourccAt(metadata["seqnoOffset"]!)
      else {
        log.debug("Did not find '?seq' placeholder in segment")
        throw DashSegmentErrors.InvalidMetadata
      }
      writeInt32BEAt(metadata["seqnoOffset"]!, value: seqno);

      let videoDecodeTime = startTime + readInt32BEAt(metadata["videoDecodeTimeOffset"]!);
      writeInt32BEAt(metadata["videoDecodeTimeOffset"]!, value: videoDecodeTime);

      // TODO: need to divide first and then multiply to fit it all into Int32, but rounding errors???
      let audioStartTime = (startTime / videoTimescale) * audioTimescale
      let audioDecodeTime = audioStartTime + readInt32BEAt(metadata["audioDecodeTimeOffset"]!);
      writeInt32BEAt(metadata["videoDecodeTimeOffset"]!, value: videoDecodeTime);
      writeInt32BEAt(metadata["audioDecodeTimeOffset"]!, value: audioDecodeTime);

      // Duration is 16 bytes after earliest_presentation_time in "sidx".
      guard
        "?prs" == readFourccAt(metadata["presentationTimeOffset"]!)
      else {
        log.debug("Did not find '?prs' placeholder in segment")
        throw DashSegmentErrors.InvalidMetadata
      }
      self.durationTime = readInt32BEAt(metadata["presentationTimeOffset"]! + 16);
      self.videoOffset = stypBox.offset
      self.mute = metadata["mute"] != 0
    }
  }
}
