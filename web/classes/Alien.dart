part of SpaceEngine;

Random random = new Random();

@Component(selector: 'alien', templateUrl: 'templates/alien_template.html', cssUrl: 'templates/alien_template.css', publishAs: 'alien')
class Alien extends GameEntity {

  Alien(){
    this.positionX = random.nextInt(700);
    this.positionY = (window.innerHeight * 0.1) + 90;
  }

  void alienRefresh() {
    this.positionY += 0.1;
    if(random.nextInt(200) >= 199){
      AlienShoot shoot = new AlienShoot(this.positionX + 50, this.getLowerEdge());
      shoots.add(shoot);
    }
  }

  void letsAnimate() {
    this.alienRefresh();
    if(this.getLowerEdge() >= GameEngine.screenHeight){
      this.animate = false;
    }
  }

  void stylizeObjects(Element element) {

  }


}
