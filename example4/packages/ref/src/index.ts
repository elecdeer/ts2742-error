import type * as CSS from "csstype";

type Element = object;
export const createWithStaticComponent = <T extends (props: any) => Element>(
  component: T,
  staticProps: Parameters<T>[0]
): T & {
  staticProps: Parameters<T>[0];
} => {
  const result = component as T & { staticProps: Parameters<T>[0] };
  result.staticProps = {
    ...staticProps,
  };
  return result;
};

export const SomeComponent = ({
  style,
}: {
  style?: CSS.Properties;
}): Element => {
  return {
    // 中身は適当
    type: "div",
    props: {
      style: style,
      className: "some-class",
    },
  };
};

export const SomeComponentWithStatic = createWithStaticComponent(
  SomeComponent,
  {
    style: {
      display: "block",
    },
  }
);
