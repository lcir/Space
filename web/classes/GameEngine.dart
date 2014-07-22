library SpaceEngine;

import 'package:angular/angular.dart';
import 'dart:html';
import 'dart:math';
import 'dart:core';


part "Alien.dart";
part "Hero.dart";
part "SpaceArmy.dart";
part "MovingObject.dart";
part "AnimatedObjects.dart";
part "HeroShoot.dart";

class GameEngine {

  static final int LEFT = 97;
  static final int RIGHT = 100;

  static final int FIRE = 32;

  static final int MOVE_STEP = 10;

  static List<AnimatedObjects> listOfAnimatedObject = new List<AnimatedObjects>();

  static var isStarted = false;

  static void animationStart() {

    if (!isStarted) {
      isStarted = true;
      _animationCore();
    }

  }

  static void _animationCore() {

    listOfAnimatedObject.removeWhere((c) => !c.animate);

    for (AnimatedObjects animatedObjects in listOfAnimatedObject) {
      if (animatedObjects.animate) {
        animatedObjects.letsAnimate();
      }
    }

    GameEngine.requestAnimationFrame(_animationCore);
  }

  static void requestAnimationFrame(fn) {
    window.requestAnimationFrame((_) => fn());
  }
}
