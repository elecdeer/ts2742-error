import type * as CSS from "csstype";

export const SomeComponent = ({ style }: { style?: CSS.Properties }) => {
  return {
    // 中身は適当
    type: "div",
    props: {
      style: style,
      className: "some-class",
    },
  };
};
