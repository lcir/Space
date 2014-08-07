part of SpaceEngine;

@Component(selector: 'hero-army', templateUrl: 'templates/hero_army_template.html', publishAs: 'heroes')
class HeroArmy extends AnimatedObjects {

  List<Hero> listOfHeroes = new List<Hero>();

  HeroArmy() {
    GameEngine.amazingHeroArmy = this;
    PageController.heroArmy = this;
  }

  void letsAnimate() {
    listOfHeroes.removeWhere((c) => (!c.animate));
  }

  void createNewHero(){
    if(listOfHeroes.isEmpty){
      listOfHeroes.add(new Hero());
    }
  }
}
