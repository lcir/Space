import 'package:angular/angular.dart';
import 'package:angular/application_factory.dart';
import 'dart:html';

void main(){
  applicationFactory().run();

  CanvasElement canvas =  querySelector("#area");

  int width = canvas.width;
  int height = canvas.height;
}