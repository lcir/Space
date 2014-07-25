part of SpaceEngine;

abstract class GameEntity extends AnimatedObjects {

  int bodyWidth = 100;
  int bodyHeight = 100;

  void stylizeObjects(Element element);

  List shoots = new List();

  void removeOldMissiles(){
    shoots.removeWhere((c) => !c.animate);
  }

  num getLowerEdge(){
    return this.positionY + bodyHeight;
  }

  num getHigherEdge(){
    return this.positionY;
  }

  void entitySmashed(){
    this.shoots.clear();
    this.animate = false;
  }
}
