part of SpaceEngine;

@Decorator(selector: '[resize-image]')
class ResizeImageDecorator {
  final Element element;
  final Scope scope;

  ResizeImageDecorator(this.element, this.scope) {
    this.element.style.verticalAlign = "top";
    getImageSmaller(null);

    this.element.onMouseOver.listen(getImageBigger);
    this.element.onMouseOut.listen(getImageSmaller);
  }

  void getImageBigger(MouseEvent event){
    this.element.style.height = "70px";
  }

  void getImageSmaller(MouseEvent event){
    this.element.style.height = "64px";
  }

}
