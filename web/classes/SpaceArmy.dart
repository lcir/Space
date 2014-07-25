part of SpaceEngine;

@Component(selector: 'space-army', templateUrl: 'templates/space_army_template.html', publishAs: 'space')
class SpaceArmy extends AnimatedObjects {

  List<Alien> aliens = new List<Alien>();

  SpaceArmy() {
    GameEngine.amazingSpaceArmy = this;

    this.aliens.add(new Alien());

  }

  void letsAnimate() {
    aliens.removeWhere((c) => (!c.animate));
  }


}
