import 'package:angular/angular.dart';
import 'package:angular/application_factory.dart';
import 'dart:html';
import 'components/PlayingCanvas.dart';
import 'classes/GameEngine.dart';

class MyAppModule extends Module {
  MyAppModule() {
    type(PlayingCanvas);
  }
}

void main() {
  applicationFactory().addModule(new MyAppModule()).run();
  window.onKeyPress.listen(keyPressed);
}

void keyPressed(KeyboardEvent event) {
  window.console.log(event.keyCode);
  if (event.keyCode == GameEngine.LEFT) {
    print("left");
  } else if (event.keyCode == GameEngine.RIGHT) {
    print("right");
  } else if (event.keyCode == GameEngine.FIRE) {
    print("FIRE!");
  }
}