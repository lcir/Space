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

   tooltipElem.appendHtml("<h5>Application help</h5>");

    DivElement textSpan = new DivElement()
      ..appendText("sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.")
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
