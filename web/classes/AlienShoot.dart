part of SpaceEngine;

class AlienShoot extends AnimatedObjects {

  AlienShoot(var positionX, var positionY):super.positions(positionX, positionY);

   void letsAnimate() {
    this.positionY += 1;
    if(positionY >= GameEngine.screenHeight - 50){
      animate = false;
    }
  }
}
