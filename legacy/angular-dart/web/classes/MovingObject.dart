part of SpaceEngine;

@Decorator(selector: '[position]', map: const {
    "position": '=>position'
}, exportExpressions: const ['positionX', 'positionY'])
class MovingObject {
  final Element element;
  final Scope scope;

  MovingObject(this.element, this.scope);

  set position(AnimatedObjects model) {
    if (model != null) {
      scope
        ..watch('positionX', (positionX, _) => movingObjectOnX(positionX, model), context: model, canChangeModel: true)
        ..watch('positionY', (positionY, _) => movingObjectOnY(positionY, model), context: model, canChangeModel: true);
    }
  }

  void movingObjectOnX(int positionX, AnimatedObjects model) {
    element.style.left = '${positionX + GameEngine.MOVE_STEP}px';
  }

  void movingObjectOnY(int positionY, AnimatedObjects model) {
    element.style.top = '${positionY + GameEngine.MOVE_STEP}px';
  }
}

