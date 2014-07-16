import 'package:angular/angular.dart';
import 'package:angular/application_factory.dart';
import 'dart:html';
import 'dart:math';

import 'components/PlayingCanvas.dart';
import 'classes/GameEngine.dart';

class MyAppModule extends Module {
  MyAppModule() {
    type(PlayingCanvas);
    type(Hero);
    type(MovingObject);
  }
}

void main() {
  applicationFactory().addModule(new MyAppModule()).run();
  window.onKeyPress.listen(keyPressed);
  requestAnimationFrame(test);
}

void requestAnimationFrame(fn) {
  window.requestAnimationFrame((_) => fn());
}

void test(){
  print("s");
  //requestAnimationFrame(test);
}
var random = new Random();

void _color() {
  var color = '#';
  for(var i = 0; i < 6; i++) {
    color += (16 * random.nextDouble()).floor().toRadixString(16);
  }
  return color;
}

void keyPressed(KeyboardEvent event) {
  window.console.log(event.keyCode);
  if (event.keyCode == GameEngine.LEFT) {
    print("left");
    DivElement el = querySelector("#heros");
    var color  = _color();
    el.style.backgroundColor = color;
  } else if (event.keyCode == GameEngine.RIGHT) {
    print("right");
  } else if (event.keyCode == GameEngine.FIRE) {
    print("FIRE!");
  }
}