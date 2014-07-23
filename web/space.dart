import 'package:angular/angular.dart';
import 'package:angular/application_factory.dart';
import 'dart:html';
import 'dart:math';

import 'classes/GameEngine.dart';

class MyAppModule extends Module {
  MyAppModule() {
    type(Hero);
    type(HeroShoot);
    type(MovingObject);
  }


}

void main() {
  applicationFactory().addModule(new MyAppModule()).run();
}