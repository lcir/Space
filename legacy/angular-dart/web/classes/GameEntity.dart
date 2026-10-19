part of SpaceEngine;

abstract class GameEntity extends AnimatedObjects {

  int bodyWidth = 100;
  int bodyHeight = 100;

  void stylizeObjects(Element element);

  List<Shoot> shoots = new List<Shoot>();

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
    this.impact();
  }

  void objectRefresh() {
    this.removeOldMissiles();
  }


}
