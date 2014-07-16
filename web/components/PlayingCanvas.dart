library Space;

import 'package:angular/angular.dart';

@Component(selector: 'play-canvas', templateUrl: 'templates/playing_canvas.html', cssUrl: 'templates/playing_canvas.css', publishAs: 'playCanvas')
class PlayingCanvas {

  void keyPressed(event){
    print("ada");
  }
}
