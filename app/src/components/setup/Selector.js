/**
 * @noflow
 */

import React from 'react';
import PureRenderMixin from 'react-addons-pure-render-mixin';
import {
  PixelRatio,
  ScrollView,
  StyleSheet,
  Text,
  TouchableHighlight,
  View,
} from 'react-native';
import { Colors } from '../CommonStyles';

class Item extends React.Component {

  static propTypes = {
    selected: React.PropTypes.bool,
    disabled: React.PropTypes.bool,
    label: React.PropTypes.string.isRequired,
    icon: React.PropTypes.element,
    onSelect: React.PropTypes.func,
  };

  shouldComponentUpdate = PureRenderMixin.shouldComponentUpdate;

  render() {
    const { selected } = this.props;
    const row = (
      <View
        style={[styles.row, selected ? styles.selectedRow : null]}>
        <Text style={[styles.rowLabel, selected ? styles.selectedRowLabel : null]}>
          {this.props.label}
        </Text>
        {this.props.icon}
      </View>
    );
    if (this.props.disabled) {
      return row;
    }
    return (
      <TouchableHighlight
        underlayColor="white"
        onPress={this.props.onSelect}>
        {row}
      </TouchableHighlight>
    );
  }

}

export default class Selector extends React.Component {

  static Item = Item;

  static propTypes = {
    headerLabel: React.PropTypes.string,
    footerLabel: React.PropTypes.string,
    onFooterPress: React.PropTypes.func,
    style: View.propTypes.style,
  };

  state = {
    maxHeight: null,
  };

  _scrollViewInitialHeight: ?number = null;
  _scrollViewHeight: ?number = null;
  _contentsHeight: ?number = null;
  _selectedRowY: ?number = null;

  _onScrollViewLayout = (event) => {
    this._scrollViewHeight = event.nativeEvent.layout.height;
    if (this._scrollViewInitialHeight === null) {
      this._scrollViewInitialHeight = this._scrollViewHeight;
    }
    this._shrinkToContentSize();
  };

  _onContentSizeChange = (width, height) => {
    this._contentsHeight = height;
    this._shrinkToContentSize();
  };

  _onLayoutSelectedRow = (event) => {
    this._selectedRowY = event.nativeEvent.layout.y;
  };

  _shrinkToContentSize() {
    if (this._contentsHeight === null ||
        this._scrollViewInitialHeight === null) {
      return;
    }
    if (this._contentsHeight >= this._scrollViewInitialHeight) {
      if (this.state.maxHeight !== null) {
        this.setState({maxHeight: null});
      }
      return;
    }
    this.setState({maxHeight: this._contentsHeight});
  }

  scrollToSelectedRow() {
    if (this._scrollViewHeight === null ||
        this._contentsHeight === null ||
        this._selectedRowY === null) {
      return;
    }
    // Scroll to the selected WiFi row so that it's displaced in the
    // center of the screen. Though if it's near the bottom of the
    // list, don't scroll past the end of the list. Similar, if it's
    // at the start of the list, don't scroll negatively.
    this.refs.scrollView.scrollTo({
      y: Math.max(
        0,
        Math.min(
          this._selectedRowY - this._scrollViewHeight / 2,
          this._contentsHeight - this._scrollViewHeight
        )
      ),
    });
  }

  _renderHeader() {
    const { headerLabel } = this.props;
    if (!headerLabel) {
      return null;
    }
    return (
      <View style={[styles.row, styles.header]}>
        <Text style={styles.headerLabel}>
          {headerLabel}
        </Text>
      </View>
    );
  }

  _renderChildren() {
    return React.Children.map(this.props.children, (element) => {
      if (element.props.selected) {
        // Attach an onLayout handler to the selected row so we know
        // where it was rendered and can scroll to it later.
        return React.createElement(element.type, {
          ...element.props,
          onLayout: this._onLayoutSelectedRow,
        });
      }
      return element;
    });
  }

  _renderFooter() {
    const { footerLabel, onFooterPress } = this.props;
    if (!footerLabel) {
      return null;
    }
    const footer = (
      <View style={[styles.row, styles.footer]}>
        <Text style={styles.footerLabel}>
          {footerLabel}
        </Text>
      </View>
    );
    if (!onFooterPress) {
      return footer;
    }
    return (
      <TouchableHighlight
        underlayColor="white"
        onPress={onFooterPress}>
        {footer}
      </TouchableHighlight>
    );
  }

  render() {
    let maxHeightStyle = null;
    if (this.state.maxHeight) {
      maxHeightStyle = {height: this.state.maxHeight};
    }
    return (
      <ScrollView
        style={[this.props.style, maxHeightStyle]}
        ref="scrollView"
        onLayout={this._onScrollViewLayout}
        onContentSizeChange={this._onContentSizeChange}>
        {this._renderHeader()}
        {this._renderChildren()}
        {this._renderFooter()}
      </ScrollView>
    );
  }

}

const styles = StyleSheet.create({
  header: {
    borderBottomColor: Colors.SilkLabsBlack,
  },
  headerLabel: {
    color: Colors.SilkLabsBlack50,
    fontFamily: 'DIN Round Pro',
    fontSize: 14,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    height: 40,
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 24,
    justifyContent: 'space-between',
    borderBottomWidth: 1 / PixelRatio.get(),
    borderBottomColor: Colors.SilkLabsBlack50,
  },
  rowLabel: {
    color: Colors.SilkLabsBlack,
    fontFamily: 'DIN Round Pro',
    fontSize: 14,
    fontWeight: '600',
  },
  selectedRow: {
    backgroundColor: 'white',
  },
  selectedRowLabel: {
    color: Colors.SilkLabsBlue,
  },
  footer: {
    height: 50,
    borderBottomWidth: 0,
    borderTopWidth: 1,
    borderTopColor: Colors.SilkLabsBlack,
  },
  footerLabel: {
    color: Colors.SilkLabsBlack50,
    fontFamily: 'DIN Round Pro',
    fontSize: 14,
  },
});
