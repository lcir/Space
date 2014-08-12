part of SpaceEngine;

@Component(selector: 'space-army', templateUrl: 'templates/space_army_template.html', publishAs: 'space')
class SpaceArmy extends AnimatedObjects {

  void destroyArmy() {
    this.aliens.clear();
  }

  List<Alien> aliens = new List<Alien>();

  SpaceArmy() {
    GameEngine.amazingSpaceArmy = this;
    PageController.spaceArmy = this;
  }

  void letsAnimate() {
    aliens.removeWhere((c) => (!c.animate));
  }

  int size(){
    return aliens.length;
  }

  void initializeOfArmy(){
    this.destroyArmy();

    this.aliens.add(new Alien());
    this.aliens.add(new Alien());
    this.aliens.add(new Alien());
    this.aliens.add(new Alien());
    this.aliens.add(new Alien());
  }
}
