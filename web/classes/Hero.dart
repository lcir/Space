part of SpaceEngine;

Random ran = new Random();

@Component(selector: 'hero', templateUrl: 'templates/hero_template.html', cssUrl: 'templates/hero_template.css', publishAs: 'hero')
class Hero extends AnimatedObjects {

  List<HeroShoot> shoots = new List<HeroShoot>();

  Hero(){
    this.positionX = ((window.innerWidth - 100) / 2);
    this.positionY = (window.innerHeight - 120) - 10;
    window.onKeyPress.listen(_keyPressed);
  }

  void _keyPressed(KeyboardEvent event) {
    window.console.log(event.keyCode);
    if (event.keyCode == GameEngine.LEFT) {
      print("left");
      _oneGrateMoveOfHero(event.keyCode);
    } else if (event.keyCode == GameEngine.RIGHT) {
      print("right");
      _oneGrateMoveOfHero(event.keyCode);
    } else if (event.keyCode == GameEngine.FIRE) {

      HeroShoot shoot = new HeroShoot(this.positionX + 50,this.positionY);
      shoots.add(shoot);

      print("FIRE!");
    }
  }

  void _oneGrateMoveOfHero(direction) {
    if (direction == GameEngine.LEFT) {
      if(positionX > 0) {
        positionX -= GameEngine.MOVE_STEP;
      }
    } else if (direction == GameEngine.RIGHT) {
      if(positionX < (window.innerWidth - 120)){
        positionX += GameEngine.MOVE_STEP;
      }
    }
  }

  void heroRefresh() {
    //Repinting hero point
  }

  void fireHeroBigLaserThing(){

  }

  void fireHeroIntelligentMissiles(){

  }

  void heroIsAmazingFireBall(){

  }

  void letsAnimate() {
    shoots.removeWhere((c) => !c.animate);
  }


}
