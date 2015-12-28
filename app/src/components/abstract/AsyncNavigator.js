import {
  Navigator,
} from 'react-native';

/**
 * Provide async versions of navigation operations that decouple them
 * from the promise chain within which they're being called.
 */
export default class AsyncNavigator extends Navigator {

  static BreadcrumbNavigationBar = Navigator.BreadcrumbNavigationBar;
  static NavigationBar = Navigator.NavigationBar;
  static SceneConfigs = Navigator.SceneConfigs;

  jumpToAsync(route) {
    requestAnimationFrame(() => this.jumpTo(route));
  }

  jumpForwardAsync(){
    requestAnimationFrame(() => this.jumpForward());
  }

  jumpBackAsync(){
    requestAnimationFrame(() => this.jumpBack());
  }

  popAsync() {
    requestAnimationFrame(() => this.pop());
  }

  popToTopAsync() {
    requestAnimationFrame(() => this.popToTop());
  }

  popToRouteAsync(route) {
    requestAnimationFrame(() => this.popToRoute(route));
  }

  replacePreviousAndPopAsync(route) {
    requestAnimationFrame(() => this.replacePreviousAndPop(route));
  }

  resetToAsync(route) {
    requestAnimationFrame(() => this.resetTo(route));
  }

  pushAsync(route) {
    requestAnimationFrame(() => this.push(route));
  }

  replaceAsync(route) {
    requestAnimationFrame(() => this.replace(route));
  }

  replacePreviousAsync(route) {
    requestAnimationFrame(() => this.replacePrevious(route));
  }

}
