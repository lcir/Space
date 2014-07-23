part of SpaceEngine;

@Decorator(selector: '[resize]')
class ResizeBodyDecorator {
  final Element element;
  final Scope scope;

  ResizeBodyDecorator(this.element, this.scope) {
    scope
      ..watch('innerWidth', (innerWidth, _) => changeScreenWidth(innerWidth), context: window, canChangeModel: true)
      ..watch('innerHeight', (innerHeight, _) => changeScreenHeight(innerHeight), context: window, canChangeModel: true);
  }

  void changeScreenWidth(size){
    GameEngine.screenWidth = size;
    this.element.style.backgroundSize = GameEngine.screenWidth.toString() + "px " + GameEngine.screenHeight.toString() + "px";
  }

  void changeScreenHeight(size){
    GameEngine.screenHeight = size;
    this.element.style.backgroundSize = GameEngine.screenWidth.toString() + "px " + GameEngine.screenHeight.toString() + "px";
  }
}
