part of SpaceEngine;

abstract class GameEntity extends AnimatedObjects {

  List shoots = new List();

  void removeOldMissiles(){
    shoots.removeWhere((c) => !c.animate);
  }
}
