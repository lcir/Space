part of SpaceEngine;

abstract class AnimatedObjects {

  var positionX = 0;
  var positionY = 0;

  bool animate = true;

  void letsAnimate();

  AnimatedObjects(){
    GameEngine.listOfNewAnimatedObject.add(this);
    GameEngine.animationStart();
  }

  AnimatedObjects.positions(var positionX, var positionY){
    this.positionX = positionX;
    this.positionY = positionY;

    GameEngine.listOfNewAnimatedObject.add(this);
    GameEngine.animationStart();
  }

  void impact() {
    animate = false;
  }

  void objectRefresh(){
  }
}
