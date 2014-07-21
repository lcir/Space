library SpaceEngine;

import 'package:angular/angular.dart';
import 'dart:html';
import 'dart:math';
import 'dart:core';


part "Alien.dart";
part "Hero.dart";
part "SpaceArmy.dart";
part "MovingObject.dart";

class GameEngine {

  static final int LEFT = 97;
  static final int RIGHT = 100;

  static final int FIRE = 32;

  static final int MOVE_STEP = 10;


  static void requestAnimationFrame(fn) {
    window.requestAnimationFrame((_) => fn());
  }
}
