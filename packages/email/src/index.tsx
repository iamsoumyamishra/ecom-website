import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Heading,
  Text,
  Hr,
} from "@react-email/components";
import { render } from "@react-email/render";
export async function loginEmail(brand: string, otp: string, support: string) {
  const element = (
    <Html>
      <Head />
      <Preview>Your {brand} sign-in code</Preview>
      <Body
        style={{ backgroundColor: "#f7f5f1", fontFamily: "Arial,sans-serif" }}
      >
        <Container style={{ padding: "48px", backgroundColor: "#ffffff" }}>
          <Text>{brand.toUpperCase()}</Text>
          <Heading>Welcome back.</Heading>
          <Text>Your sign-in code is</Text>
          <Heading style={{ fontSize: "40px", letterSpacing: "10px" }}>
            {otp}
          </Heading>
          <Text>
            It expires in five minutes and can be used once. If you did not
            request it, ignore this email.
          </Text>
          <Hr />
          <Text>Need help? {support}</Text>
        </Container>
      </Body>
    </Html>
  );
  return {
    html: await render(element),
    text: `${brand}\nYour sign-in code: ${otp}\nExpires in five minutes. Use once. Ignore if you did not request it.\nSupport: ${support}`,
  };
}
export async function orderEmail(
  brand: string,
  number: string,
  kind: string,
  support: string,
) {
  const text = `${brand}\nOrder ${number}\n${kind === "shipment" ? "Your order has shipped. Check your account for tracking." : "Payment confirmed. Thank you for your order."}\nVisit your account for details.\nSupport: ${support}`;
  return {
    html: await render(
      <Html>
        <Head />
        <Body>
          <Container>
            <Heading>{brand}</Heading>
            <Text>Order {number}</Text>
            <Text>
              {kind === "shipment"
                ? "Your order has shipped. Check your account for tracking."
                : "Payment confirmed. Thank you for your order."}
            </Text>
            <Text>Support: {support}</Text>
          </Container>
        </Body>
      </Html>,
    ),
    text,
  };
}
