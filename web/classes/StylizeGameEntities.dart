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
      entity.bodyWidth = double.parse(this.element.style.width);
      entity.bodyHeight = double.parse(this.element.style.height);

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
