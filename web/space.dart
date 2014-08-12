import 'package:angular/angular.dart';
import 'package:angular/application_factory.dart';
import 'dart:html';
import 'dart:math';

import 'classes/GameEngine.dart';

class MyAppModule extends Module {
  MyAppModule() {
    type(Hero);
    type(MovingObject);
    type(Alien);
    type(SpaceArmy);
    type(ResizeBodyDecorator);
    type(StylizeGameEntities);
    type(HelpDecorator);
    type(ResizeImageDecorator);
    type(PageController);
    type(HeroArmy);
  }
}

int top = 30;
DivElement element = null;
DivElement buttonDiv = null;

void main() {
  applicationFactory().addModule(new MyAppModule()).run();
  window.onMouseWheel.listen(_mouseWheel);

  element = querySelector(".resizer-nav");
  element.style.height = "${window.innerHeight - 50}px";
}

void _mouseWheel(WheelEvent event) {

  bool move = false;

  int elementHeight = int.parse(element.style.height.replaceAll("px", ""));

  if ((top < 30) && (event.deltaY > 0)) {
    top += 20;
    gameStop();
  } else if ((elementHeight + top > 100) && (event.deltaY < 0)) {
    top -= 20;
    move = true;
    gameStop();
  }

  element.style.top = top.toString() + "px";

  if ((move) && element.clientHeight + top <= 100) {
    if (buttonDiv == null) {
      buttonDiv = new DivElement();

      ButtonElement buttonElement = new ButtonElement();
      buttonElement.appendText("Let's play a game");
      buttonElement.classes = ["btn", "btn-danger"];
      buttonElement.onClick.listen(playButtonClick);
      buttonDiv.append(buttonElement);

      buttonDiv.style
        ..position = "absolute"
        ..top = "${(window.innerHeight / 2) - 10}px"
        ..left = "${(window.innerWidth / 2) - 55}px";

      document.body.append(buttonDiv);
    }
  }

}


void playButtonClick(MouseEvent event) {
  if (buttonDiv != null) {
    playButtonRemove();
    gameStart();
  }
}

void playButtonRemove() {
  if (buttonDiv != null) {
    buttonDiv.remove();
    buttonDiv = null;
  }
}


void gameStart() {
  GameEngine.amazingSpaceArmy.initializeOfArmy();
  GameEngine.amazingHeroArmy.createNewHero();
  GameEngine.animationStart();
}

void gameStop() {
  GameEngine.animationPause();
  GameEngine.amazingSpaceArmy.destroyArmy();
  GameEngine.amazingHeroArmy.destroyHero();

  playButtonRemove();
}