part of SpaceEngine;

@Decorator(selector: '[help-decorator]')
class HelpDecorator {
  final Element element;
  final Scope scope;

  Element tooltipElem;

  HelpDecorator(this.element, this.scope) {
    element
      ..onMouseEnter.listen((_) => _createTemplate())
      ..onMouseLeave.listen((_) => _destroyTemplate());
  }


  void _createTemplate() {

    tooltipElem = new DivElement();

   tooltipElem.appendHtml("<h4>Game help</h4>");

    DivElement textSpan = new DivElement()
      ..appendText("This game is controlled by 3 keys on keyboard. If you want turn left with the Ship, you must press key 'A'. If you want turn to right, press key 'D'. To shoot you must pres key 'Space'. Enjoy game.")
      ..style.color = "white"
      ..style.fontSize = "smaller"
      ..style.paddingBottom = "5px";

    tooltipElem.append(textSpan);


    tooltipElem.style
      ..padding = "5px"
      ..paddingBottom = "0px"
      ..backgroundColor = "black"
      ..borderRadius = "5px";

    // position the tooltip.
    var elTopRight = element.offset.topRight;

    tooltipElem.style
      ..position = "absolute"
      ..top = "${elTopRight.y + 20}px"
      ..left = "${elTopRight.x - 200}px";

    // Add the tooltip to the document body. We add it here because
    // we need to position it absolutely, without reference to its
    // parent element.
    document.body.append(tooltipElem);
  }

  void _destroyTemplate() {
    tooltipElem.remove();
  }
}
