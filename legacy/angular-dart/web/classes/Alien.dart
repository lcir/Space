part of SpaceEngine;

class Alien extends GameEntity {

  Random _random = new Random();

  Alien(){
    this.positionX = _random.nextInt(window.innerWidth - this.bodyWidth);
    this.positionY = (window.innerHeight * 0.1) + 90;
  }

  void alienRefresh() {
    this.positionY += 0.1;
    if(_random.nextInt(2000) >= 1999){
      AlienShoot shoot = new AlienShoot(this.positionX + 50, this.getLowerEdge());
      shoots.add(shoot);
    }
  }

  void letsAnimate() {
    this.alienRefresh();
    if(this.getLowerEdge() >= GameEngine.screenHeight){
      this.entitySmashed();
    }
  }

  void stylizeObjects(Element element) {

  }


}
