part of SpaceEngine;

@Decorator(selector: '[stylize]', map: const {
    "stylize": '=>stylize'
})
class StylizeGameEntities {
  final Element element;
  final Scope scope;

  StylizeGameEntities(this.element, this.scope) {

  }

  set stylize(GameEntity entity) {
    if (entity != null) {
      if (this.element.style.width.contains("px")) {
        entity.bodyWidth = int.parse(this.element.style.width.replaceAll("px", ""));
      }
      if (this.element.style.height.contains("px")) {
        entity.bodyHeight = int.parse(this.element.style.height.replaceAll("px", ""));
      }
      entity.stylizeObjects(this.element);
      scope
        ..watch('animate', (animate, _) => changeAnimation(animate), context: entity, canChangeModel: true);
    }
  }

  void changeAnimation(bool animate) {
    if (!animate) {
      this.element.hidden = true;
    }
  }

}
