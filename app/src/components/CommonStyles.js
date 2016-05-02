import {
  PixelRatio,
  StyleSheet,
  Navigator,
} from 'react-native';

export const FormStyles = StyleSheet.create({
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

export const LayoutStyles = StyleSheet.create({
  statusBarPlaceholder: {
    height: Navigator.NavigationBar.Styles.General.StatusBarHeight,
  },
});

export const TitleBarStyles = StyleSheet.create({
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

export const ThumbnailStyles = StyleSheet.create({
  // This style gets applied to each individual thumbnail container as
  // well as the container of all thumbnails. That way the overall
  // margins between thumbnails and screen edge as well as between
  // thumbnails themselves will be twice the value specified below.
  thumbnailContainer: {
    margin: THUMBNAIL_MARGIN,
  },
});

export const Colors = {
  SilkLabsBlack: 'rgb(66, 66, 66)',
  SilkLabsBlack50: 'rgba(66, 66, 66, 0.5)',
  SilkLabsBlue: 'rgb(44, 114, 185)',
  SilkLabsGreen: 'rgb(141, 202, 200)',
  SilkLabsLightBlue: 'rgb(241, 246, 246)',
  SilkLabsRed: 'rgb(238, 75, 48)',
  SilkLabsTan: 'rgb(239, 234, 223)',
  SilkLabsYellow: 'rgb(253, 214, 123)',
  WarningRed: 'rgb(229, 77, 66)',
  ConfirmGreen: 'rgb(57, 202, 116)',
};

export const SetupStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.SilkLabsGreen,
    paddingHorizontal: 32,
    paddingTop: Navigator.NavigationBar.Styles.General.StatusBarHeight + 24,
    paddingBottom: 24,
  },
  title: {
    fontFamily: 'DIN Round Pro',
    fontSize: 24,
    color: 'white',
  },
  subtitle: {
    fontFamily: 'DIN Round Pro',
    fontWeight: '600',
    fontSize: 14,
    color: Colors.SilkLabsBlack,
    marginVertical: 10,
  },
  formInput: {
    height: 44,
    fontFamily: 'Open Sans',
    fontSize: 18,
    flex: 1,
  },
});
