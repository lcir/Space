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
}