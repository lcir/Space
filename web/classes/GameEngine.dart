library SpaceEngine;

import 'package:angular/angular.dart';
import 'dart:html';
import 'dart:math';
import 'dart:core';


part "Alien.dart";
part "GameEntity.dart";
part "Hero.dart";
part "SpaceArmy.dart";
part "MovingObject.dart";
part "AnimatedObjects.dart";
part "HeroShoot.dart";
part "AlienShoot.dart";
part "ResizeBodyDecorator.dart";
part "StylizeGameEntities.dart";
part "Shoot.dart";
part "HelpDecorator.dart";

class GameEngine {


  static final int LEFT = 97;
  static final int RIGHT = 100;

  static final int FIRE = 32;

  static final int MOVE_STEP = 10;

  static int screenWidth;
  static int screenHeight;

  static List<AnimatedObjects> listOfAnimatedObject = new List<AnimatedObjects>();
  static List<AnimatedObjects> listOfNewAnimatedObject = new List<AnimatedObjects>();

  static var isStarted = false;

  static SpaceArmy amazingSpaceArmy;
  static Hero absoluteHero;

  static void testForHeroImpact(AlienShoot shoot) {
    if (absoluteHero != null) {
      if (absoluteHero.animate) {
        if (((absoluteHero.positionX) <= shoot.positionX) && ((absoluteHero.positionX + absoluteHero.bodyWidth) >= shoot.positionX) && (absoluteHero.getHigherEdge() <= shoot.positionY )) {
          absoluteHero.entitySmashed();

          print(absoluteHero);
          print(absoluteHero.positionX);
          print(absoluteHero.positionY);

          print(shoot);
          print(shoot.positionX);
          print(shoot.positionY);
        }
      }
    }
  }

  static void testForAliensImpact(HeroShoot shoot) {
    if (amazingSpaceArmy != null) {
      for (Alien alien in amazingSpaceArmy.aliens) {
        if (alien.animate) {
          if (alien.getLowerEdge() >= shoot.positionY) {
            alien.entitySmashed();
            shoot.impact();

            print(alien);
            print(alien.positionX);
            print(alien.positionY);
            print(alien.getLowerEdge());

            print(shoot);
            print(shoot.positionX);
            print(shoot.positionY);
          }
        }
      }
    }
  }

  static void animationStart() {

    if (!isStarted) {
      isStarted = true;
      _animationCore();
    }

  }

  static void animationPause() {
    isStarted = false;
  }

  static void _animationCore() {

    listOfAnimatedObject.removeWhere((c) => !c.animate);

    listOfAnimatedObject.addAll(listOfNewAnimatedObject);
    listOfNewAnimatedObject.clear();

    for (AnimatedObjects animatedObjects in listOfAnimatedObject) {
      if (animatedObjects.animate) {
        animatedObjects.letsAnimate();
      }
      animatedObjects.objectRefresh();
    }

    GameEngine.requestAnimationFrame(_animationCore);

  }

  static void requestAnimationFrame(fn) {
    window.requestAnimationFrame((_) => fn());
  }
}
