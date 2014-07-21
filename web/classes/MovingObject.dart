part of SpaceEngine;

@Decorator(selector: '[position]', map: const {
    "position": '=>position'
}, exportExpressions: const ['positionX', 'positionY'])
class MovingObject {
  final Element element;
  final Scope scope;

  MovingObject(this.element, this.scope);

  set position(Hero model) {
    scope
      ..watch('positionX', (positionX, _) => element.style.left = '${positionX + GameEngine.MOVE_STEP}px', context: model, canChangeModel: true)
      ..watch('positionY', (positionY, _) => element.style.top = '${positionY + GameEngine.MOVE_STEP}px', context: model, canChangeModel: false);
  }
}

