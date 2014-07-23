part of SpaceEngine;

Random random = new Random();

@Component(selector: 'alien', templateUrl: 'templates/alien_template.html', cssUrl: 'templates/alien_template.css', publishAs: 'alien')
class Alien extends GameEntity {

  Alien(){
    this.positionX = random.nextInt(1400);
    this.positionY = (window.innerHeight * 0.1) + 110;
  }

  void alienRefresh() {
    this.positionY += 0.1;
    if(random.nextInt(200) >= 199){
      AlienShoot shoot = new AlienShoot(this.positionX + 50, this.positionY);
      shoots.add(shoot);
    }
  }

  void letsAnimate() {
    this.alienRefresh();
    this.removeOldMissiles();
  }


}
