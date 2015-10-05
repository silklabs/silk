import {
  Navigator,
} from 'react-native';

/**
 * Provide async versions of navigation operations that decouple them
 * from the promise chain within which they're being called.
 */
export default class extends Navigator {

  static BreadcrumbNavigationBar = Navigator.BreadcrumbNavigationBar;
  static NavigationBar = Navigator.NavigationBar;
  static SceneConfigs = Navigator.SceneConfigs;

  jumpToAsync(route) {
    setTimeout(() => this.jumpTo(route), 0);
  }

  jumpForwardAsync(){
    setTimeout(() => this.jumpForward(), 0);
  }

  jumpBackAsync(){
    setTimeout(() => this.jumpBack(), 0);
  }

  popAsync() {
    setTimeout(() => this.pop(), 0);
  }

  popToTopAsync() {
    setTimeout(() => this.popToTop(), 0);
  }

  popToRouteAsync(route) {
    setTimeout(() => this.popToRoute(route), 0);
  }

  replacePreviousAndPopAsync(route) {
    setTimeout(() => this.replacePreviousAndPop(route), 0);
  }

  resetToAsync(route) {
    setTimeout(() => this.resetTo(route), 0);
  }

  pushAsync(route) {
    setTimeout(() => this.push(route), 0);
  }

  replaceAsync(route) {
    setTimeout(() => this.replace(route), 0);
  }

  replacePreviousAsync(route) {
    setTimeout(() => this.replacePrevious(route), 0);
  }

}
