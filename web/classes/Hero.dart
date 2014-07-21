part of SpaceEngine;

@Component(selector: 'hero', templateUrl: 'templates/hero_template.html', cssUrl: 'templates/hero_template.css', publishAs: 'hero')
class Hero {

  var positionX = (window.innerWidth - 100) / 2;
  var positionY = (window.innerHeight - 120) - 10;


  Hero(){
    window.onKeyPress.listen(_keyPressed);
    //GameEngine.requestAnimationFrame(test);
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
      print("FIRE!");
    }
  }

  void _oneGrateMoveOfHero(direction) {
    //step until screenL < position < screenR
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
}
