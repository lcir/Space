part of SpaceEngine;

class AlienShoot extends AnimatedObjects {

  AlienShoot(var positionX, var positionY):super.positions(positionX, positionY);

  void letsAnimate() {
    this.positionY += 1;
    GameEngine.testForHeroImpact(this);
    if (positionY >= GameEngine.screenHeight - 50) {
      this.impact();
    }
  }
 }
