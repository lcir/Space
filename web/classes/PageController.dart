part of SpaceEngine;

@Controller(selector: '[page-controller]', publishAs: 'page')
class PageController {

  static SpaceArmy spaceArmy = new SpaceArmy();
  static HeroArmy heroArmy = new HeroArmy();

  int score(){
    return GameEngine.gameScore;
  }


  int size(){
    return spaceArmy.size();
  }
}
