part of SpaceEngine;

class HeroShoot extends AnimatedObjects {

  impact() {
    animate = false;
  }

  HeroShoot(var positionX, var positionY):super.positions(positionX, positionY);

   void letsAnimate() {
    this.positionY -= 2;
    GameEngine.testForAliensImpact(this);
    if(positionY <= 0){
      this.impact();
    }
  }
}
