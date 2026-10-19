part of SpaceEngine;

@Component(selector: 'hero', templateUrl: 'templates/hero_template.html', cssUrl: 'templates/hero_template.css', publishAs: 'hero')
class Hero extends GameEntity{

  Hero() {
    this.positionX = window.innerWidth * 0.5 - 50;
    window.onKeyPress.listen(_keyPressed);
    GameEngine.absoluteHero = this;
  }

  void _keyPressed(KeyboardEvent event) {
    if (event.keyCode == GameEngine.LEFT) {
      _oneGrateMoveOfHero(event.keyCode);
    } else if (event.keyCode == GameEngine.RIGHT) {
      _oneGrateMoveOfHero(event.keyCode);
    } else if (event.keyCode == GameEngine.FIRE) {
      this.fireHeroBigLaserThing();
    }
  }

  void _oneGrateMoveOfHero(direction) {
    if (direction == GameEngine.LEFT) {
      if (positionX > 0) {
        positionX -= GameEngine.MOVE_STEP;
      }
    } else if (direction == GameEngine.RIGHT) {
      if (positionX < (window.innerWidth - 120)) {
        positionX += GameEngine.MOVE_STEP;
      }
    }
  }

  void heroRefresh() {
    this.positionY = (window.innerHeight * 0.95) - 50;
  }

  void fireHeroBigLaserThing() {
    HeroShoot shoot = new HeroShoot(this.positionX + 50, this.positionY);
    shoots.add(shoot);
  }

  void fireHeroIntelligentMissiles() {
  }

  void heroIsAmazingFireBall() {
  }

  void letsAnimate() {
    this.heroRefresh();
  }

  void stylizeObjects(Element element) {
  }
}
