part of SpaceEngine;

class HeroShoot extends AnimatedObjects {

  HeroShoot(var positionX, var positionY):super.positions(positionX, positionY);

   void letsAnimate() {
    this.positionY -= 2;
    if(positionY <= 0){
      animate = false;
    }
  }
}
