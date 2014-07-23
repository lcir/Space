part of SpaceEngine;

@Component(selector: 'space-army', templateUrl: 'templates/space_army_template.html', publishAs: 'space')
class SpaceArmy {

  List<Alien> aliens = new List<Alien>();

  SpaceArmy(){
    this.aliens.add(new Alien());
    this.aliens.add(new Alien());
    this.aliens.add(new Alien());
    this.aliens.add(new Alien());
    this.aliens.add(new Alien());
    this.aliens.add(new Alien());
    this.aliens.add(new Alien());
    this.aliens.add(new Alien());
  }

}
