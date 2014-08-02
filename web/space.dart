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
  }


}

int top = 30;
DivElement element = null;
DivElement gameElement = null;
DivElement buttonDiv = null;

void main() {
  applicationFactory().addModule(new MyAppModule()).run();
  window.onMouseWheel.listen(_mouseWheel);

  element = querySelector(".resizer-nav");
  gameElement = querySelector("#game-space");
  element.style.height = "${window.innerHeight}px";
}

void _mouseWheel(WheelEvent event) {

  bool move = false;

  if ((top < 30) && (event.deltaY > 0)) {
    top += 10;
    gameStop();
  } else if ((element.clientHeight + top > 100) && (event.deltaY < 0)) {
    top -= 10;
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
    buttonDiv.remove();
    buttonDiv = null;
    gameStart();
  }
}

void gameStart(){
  gameElement.hidden = false;
  GameEngine.animationStart();
}

void gameStop(){
  gameElement.hidden = true;
  GameEngine.animationPause();
}