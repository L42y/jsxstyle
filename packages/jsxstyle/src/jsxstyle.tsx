// tslint:disable max-classes-per-file

import {
  componentStyles,
  CSSProperties,
  DeprecatedJsxstyleComponentName,
  getStyleCache,
  JsxstyleComponentName,
  Falsey,
} from 'jsxstyle-utils';
import * as React from 'react';

type IntrinsicElement = keyof JSX.IntrinsicElements;

type ComponentOrIntrinsicElement =
  | IntrinsicElement
  | React.FunctionComponent<any>
  | React.ComponentClass<any>;

type ValidComponentPropValue =
  | false
  | null
  | undefined
  | ComponentOrIntrinsicElement;

/**
 * Generic that returns either the extracted props type for a React component
 * or the props type for an IntrinsicElement.
 */
// shout out to https://git.io/fxMvl
// modified to add detection for empty interfaces
type ExtractProps<T extends ValidComponentPropValue> = T extends
  | false
  | null
  | undefined
  ? JSX.IntrinsicElements['div']
  : T extends IntrinsicElement
  ? JSX.IntrinsicElements[T]
  : T extends React.FunctionComponent<infer FCProps>
  ? keyof FCProps extends never
    ? {}
    : FCProps
  : T extends React.ComponentClass<infer ClassProps>
  ? keyof ClassProps extends never
    ? {}
    : ClassProps
  : {};

export { CSSProperties };

/** Shared instance of a style cache object. */
export const cache = getStyleCache();

/** Props that will be passed through to whatever component is specified */
export interface StylableComponentProps<T extends ValidComponentPropValue>
  extends Falsey<Pick<ExtractProps<T>, 'className' | 'style'>> {}

/** Common props */
interface SharedProps<T extends ValidComponentPropValue>
  extends StylableComponentProps<T>,
    CSSProperties {
  /** An object of media query values keyed by the desired style prop prefix */
  mediaQueries?: Record<string, string>;
}

/** Props for jsxstyle components that have a `component` prop set */
interface JsxstylePropsWithComponent<C extends ValidComponentPropValue>
  extends SharedProps<C> {
  /** Component value can be either a React component or a tag name string. Defaults to `div`. */
  component: C;
  /** Object of props that will be passed down to the component specified in the `component` prop */
  props?: ExtractProps<C>;
}

/** Props for jsxstyle components that have no `component` prop set */
interface JsxstyleDefaultProps extends SharedProps<'div'> {
  /** Component value can be either a React component or a tag name string. Defaults to `div`. */
  component?: undefined;
  /** Object of props that will be passed down to the underlying div */
  props?: JSX.IntrinsicElements['div'];
}

export type JsxstyleProps<C extends ValidComponentPropValue> =
  | JsxstyleDefaultProps
  | JsxstylePropsWithComponent<C>;

type CustomPropsObj = Record<string, (value: any) => CSSProperties | null>;

type MakeComponentProps<
  P extends Record<string, any>,
  K extends keyof P,
  F extends CustomPropsObj = {}
> = Omit<CSSProperties, K | keyof F> &
  Pick<P, K | 'className' | 'style'> &
  { [KF in keyof F]?: Parameters<F[KF]>[0] };

interface MakeComponentOptionsWithoutCustomProps<
  P extends ExtractProps<C>,
  K extends keyof P,
  C extends ComponentOrIntrinsicElement = 'div'
> {
  component?: C;
  componentProps?: K[];
  defaultStyles?: CSSProperties | null;
  displayName: string;
}

interface MakeComponentOptions<
  P extends ExtractProps<C>,
  K extends keyof P,
  F extends CustomPropsObj,
  C extends ComponentOrIntrinsicElement = 'div'
> extends MakeComponentOptionsWithoutCustomProps<P, K, C> {
  customProps?: F;
}

const defaultTagName = 'div';

export const EXPERIMENTAL_makeComponent = <
  P extends ExtractProps<C>,
  K extends Extract<keyof P, string>,
  F extends CustomPropsObj,
  C extends ComponentOrIntrinsicElement
>({
  component,
  componentProps,
  customProps,
  defaultStyles,
  displayName,
}: MakeComponentOptions<P, K, F, C>) => {
  // always pass `style` and `className` props through
  const allowedProps: Record<string, true> = { style: true, className: true };
  if (Array.isArray(componentProps)) {
    for (const propName of componentProps) {
      allowedProps[propName as string] = true;
    }
  }

  const customComponent = (
    props: MakeComponentProps<P, K, F>
  ): React.ReactElement<any, any> => {
    const componentProps: Record<string, any> = {};
    const styleProps: Record<string, any> = {};
    // merging default style props here rather than using `defaultProps` so that the default props don't show up in React dev tools.
    if (defaultStyles) Object.assign(styleProps, defaultStyles);

    // separate component props and style props
    for (const key in props) {
      const value = props[key];

      if (allowedProps[key]) {
        componentProps[key] = value;
      } else {
        const getProp = customProps && customProps[key];
        if (getProp) {
          Object.assign(styleProps, getProp(value));
        } else {
          if (value == null) continue;
          styleProps[key] = value;
        }
      }
    }

    const className = cache.getClassName(styleProps, props.className);
    if (className) {
      componentProps.className = className;
    }
    return React.createElement(
      component || defaultTagName,
      componentProps,
      props.children
    );
  };

  customComponent.displayName = `jsxstyle(${displayName})`;

  /** Create a new component that inherits `customProps` from the parent component */
  customComponent.makeComponent = <
    P2 extends ExtractProps<C2>,
    K2 extends Extract<keyof P2, string>,
    C2 extends ComponentOrIntrinsicElement
  >(
    options: MakeComponentOptionsWithoutCustomProps<P2, K2, C2>
  ) =>
    EXPERIMENTAL_makeComponent<P2, K2, F, C2>({
      ...options,
      displayName: displayName + '.' + options.displayName,
      customProps,
    });

  return customComponent;
};

function factory(
  displayName: JsxstyleComponentName | DeprecatedJsxstyleComponentName
) {
  const defaultProps = componentStyles[displayName];

  const component = <T extends ValidComponentPropValue = 'div'>(
    props: React.PropsWithChildren<JsxstyleProps<T>>
  ): React.ReactElement => {
    const Component: any = props.component || defaultTagName;
    // `className` prop is only available in types if the `component` supports it
    const className = cache.getClassName(props, (props as any).className);
    const componentProps: Record<string, any> = { ...props.props };

    if (className) {
      componentProps.className = className;
    }

    // `style` prop is only available in types if the `component` supports it
    if ((props as any).style) {
      componentProps.style = (props as any).style;
    }

    return React.createElement(Component, componentProps, props.children);
  };

  component.displayName = displayName;
  component.defaultProps = defaultProps;

  return component;
}

let depFactory = factory;

if (process.env.NODE_ENV === 'development') {
  depFactory = function (displayName: DeprecatedJsxstyleComponentName) {
    const defaultProps = componentStyles[displayName];
    let hasWarned = false;

    const component = <T extends ValidComponentPropValue = 'div'>(
      props: React.PropsWithChildren<JsxstyleProps<T>>
    ): React.ReactElement => {
      if (!hasWarned) {
        hasWarned = true;
        console.error(
          'jsxstyle\u2019s `%s` component is deprecated and will be removed in future versions of jsxstyle.',
          displayName
        );
      }
      return React.createElement(Box as any, props as any);
    };

    component.displayName = displayName;
    component.defaultProps = defaultProps;

    return component;
  };
}

// Using ReturnType + explicit typing to prevent Hella Dupes in the generated types
type JsxstyleComponent = ReturnType<typeof factory>;

export const Box: JsxstyleComponent = factory('Box');
export const Block: JsxstyleComponent = factory('Block');
export const Inline: JsxstyleComponent = factory('Inline');
export const InlineBlock: JsxstyleComponent = factory('InlineBlock');

export const Row: JsxstyleComponent = factory('Row');
export const Col: JsxstyleComponent = factory('Col');
export const InlineRow: JsxstyleComponent = factory('InlineRow');
export const InlineCol: JsxstyleComponent = factory('InlineCol');

export const Grid: JsxstyleComponent = factory('Grid');

// <Box component="table" />
export const Table: JsxstyleComponent = depFactory('Table');
export const TableRow: JsxstyleComponent = depFactory('TableRow');
export const TableCell: JsxstyleComponent = depFactory('TableCell');

// <Row />
export const Flex: JsxstyleComponent = depFactory('Flex');

// <Row display="inline-flex" />
export const InlineFlex: JsxstyleComponent = depFactory('InlineFlex');

export { useMatchMedia } from './useMatchMedia';
