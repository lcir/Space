part of SpaceEngine;

abstract class AnimatedObjects {

  var positionX = (window.innerWidth - 100) / 2;
  var positionY = (window.innerHeight - 120) - 10;

  void letsAnimate();

  AnimatedObjects() {
    GameEngine.animationStart();
  }
}
