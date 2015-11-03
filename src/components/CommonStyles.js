import {
  PixelRatio,
  StyleSheet,
  Navigator,
} from 'react-native';

export let FormStyles = StyleSheet.create({
  formHeader: {
    fontWeight: '500',
    color: '#404e55',
    marginTop: 16,
    marginLeft: 8,
    marginBottom: 4,
  },
  form: {
    backgroundColor: 'white',
    borderTopWidth: 1 / PixelRatio.get(),
    borderBottomWidth: 1 / PixelRatio.get(),
    borderColor: '#c8c7cc',
    flex: 1,
  },
  formRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: '#c8c7cc',
    borderTopWidth: 1 / PixelRatio.get(),
    height: 46,
    paddingLeft: 16,
    paddingRight: 8,
  },
  formRowFirst: {
    borderTopWidth: 0,
  },
  formRowLabelContainer: {
    flex: 1,
  },
  formRowLabel: {
    fontSize: 17,
  },
  formInputContainer: {
    flex: 2,
  },
  formInput: {
    height: 44,
    fontSize: 17,
    flex: 1,
  },
  formButtonLabel: {
    color: '#007aff',
    fontSize: 17,
  },
});

export let LayoutStyles = StyleSheet.create({
  statusBarPlaceholder: {
    height: Navigator.NavigationBar.Styles.General.StatusBarHeight,
  },
});

export let TitleBarStyles = StyleSheet.create({
  titleBar: {
    height: Navigator.NavigationBar.Styles.General.NavBarHeight,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  titleBarLabel: {
    color: 'black',
    fontSize: 17,
    textAlign: 'center',
    fontWeight: '500',
  },
  titleBarLeftButton: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: Navigator.NavigationBar.Styles.General.NavBarHeight,
    padding: 8,
    alignItems: 'center',
    flexDirection: 'row',
  },
  titleBarRightButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    height: Navigator.NavigationBar.Styles.General.NavBarHeight,
    padding: 8,
    alignItems: 'center',
    flexDirection: 'row',
  },
  titleBarButtonLabel: {
    color: '#007aff',
    fontSize: 17,
  },
});

export const THUMBNAIL_MARGIN = 4;

export let ThumbnailStyles = StyleSheet.create({
  // This style gets applied to each individual thumbnail container as
  // well as the container of all thumbnails. That way the overall
  // margins between thumbnails and screen edge as well as between
  // thumbnails themselves will be twice the value specified below.
  thumbnailContainer: {
    margin: THUMBNAIL_MARGIN,
  },
});
