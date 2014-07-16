part of SpaceEngine;

class Hero {

  int _positionX = 0;
  int _positionY = 0;

  final int _moveStep = 10;

  void oneGrateMoveOfHero(direction) {
    //step until screenL < position < screenR
    if (direction == GameEngine.LEFT) {
      _positionY -= _moveStep;
      heroRefresh();
    } else if (direction == GameEngine.RIGHT) {
      _positionY += _moveStep;
      heroRefresh();
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
