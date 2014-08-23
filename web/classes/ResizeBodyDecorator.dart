part of SpaceEngine;

@Decorator(selector: '[resize]')
class ResizeBodyDecorator {
  final Element element;
  final Scope scope;
  DivElement resizer = null;

  ResizeBodyDecorator(this.element, this.scope) {
    scope
      ..watch('innerWidth', (innerWidth, _) => changeScreenWidth(innerWidth), context: window, canChangeModel: true)
      ..watch('innerHeight', (innerHeight, _) => changeScreenHeight(innerHeight), context: window, canChangeModel: true);

    resizer = querySelector(".resizer-nav");
  }

  void changeScreenWidth(size) {
    GameEngine.screenWidth = size;
    this.element.style.backgroundSize = GameEngine.screenWidth.toString() + "px " + GameEngine.screenHeight.toString() + "px";

    ButtonElement playButton = querySelector(".btn-danger");

    if (playButton != null) {
      playButton.style
        ..top = "${(window.innerHeight / 2) - 10}px"
        ..left = "${(window.innerWidth / 2) - 55}px";
    }
  }

  void changeScreenHeight(size) {
    GameEngine.screenHeight = size;
    this.element.style.backgroundSize = GameEngine.screenWidth.toString() + "px " + GameEngine.screenHeight.toString() + "px";

    ButtonElement playButton = querySelector(".btn-danger");

    if (playButton != null) {
      playButton.style
        ..top = "${(window.innerHeight / 2) - 10}px"
        ..left = "${(window.innerWidth / 2) - 55}px";
    }

    if (playButton == null) {
      if (resizer != null) {
        resizer.style.height = "${window.innerHeight - 50}px";
      }
    }
  }
}
