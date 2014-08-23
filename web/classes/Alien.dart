part of SpaceEngine;

Random random = new Random();

@Component(selector: 'alien', templateUrl: 'templates/alien_template.html', cssUrl: 'templates/alien_template.css', publishAs: 'alien')
class Alien extends GameEntity {

  Alien(){
    this.positionX = random.nextInt(window.innerWidth);
    this.positionY = (window.innerHeight * 0.1) + 90;
  }

  void alienRefresh() {
    this.positionX = this.positionX;
    this.positionY += 0.1;
    if(random.nextInt(2000) >= 1999){
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
