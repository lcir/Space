part of SpaceEngine;

@Decorator(selector: '[position]', map: const {
    "position": '=>position'
}, exportExpressions: const ['x', 'y'])
class MovingObject {
  final Element element;
  final Scope scope;

  MovingObject(this.element, this.scope);

  px(x) => _CACHE[max(0, x.round())];

  static _color() {
    var color = '#';
    for (var i = 0; i < 6; i++) {
      color += (16 * random.nextDouble()).floor().toRadixString(16);
    }
    return color;
  }

  set position(Hero model) {
    var style = element.style;
    style.backgroundColor = "red";
    scope
      ..watch('x', (x, _) => element.style.left = '${x + 10}px', context: model, canChangeModel: false)
      ..watch('y', (y, _) => element.style.top = '${y + 10}px', context: model, canChangeModel: false);

    requestAnimationFrame(test);
  }

  void requestAnimationFrame(fn) {
    window.requestAnimationFrame((_) => fn());
  }

  void test() {
    print("ssss");
    requestAnimationFrame(test);
  }
}

