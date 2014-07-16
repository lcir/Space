library Space;

import 'package:angular/angular.dart';
import 'dart:html';

@Component(selector: 'play-canvas', templateUrl: 'templates/playing_canvas.html', cssUrl: 'templates/playing_canvas.css', publishAs: 'playCanvas')
class PlayingCanvas {

  void keyPressed(event) {
    print("ada");
  }


  void clearCanvas() {
    CanvasElement canvas = querySelector("#area");
    CanvasRenderingContext2D context = canvas.context2D;

    context.clearRect(0, 0, canvas.height, canvas.width);
  }
}
