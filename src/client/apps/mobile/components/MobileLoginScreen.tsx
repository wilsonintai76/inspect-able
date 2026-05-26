import React from 'react';
import { Box, Flex, VStack, Text, Heading, Image, Card } from '@chakra-ui/react';
import { BRANDING } from '../../../constants';
import { User } from '@shared/types';

interface Props {
  onLogin: (user: User) => void;
  logoBrand?: string;
}

export const MobileLoginScreen: React.FC<Props> = ({ logoBrand }) => {
  const googleUrl = `/api/auth/google?returnTo=${encodeURIComponent(window.location.origin)}`;
  const displayLogo = logoBrand || BRANDING.logoBrand;

  return (
    <Flex minH="100dvh" bg="bg.subtle" direction="column" align="center" justify="center" p={4}>
      <Card.Root maxW="xs" w="full" borderRadius="3xl" borderWidth="1px" borderColor="border.subtle" shadow="xl" overflow="hidden">
        <Card.Header bg="bg" borderBottomWidth="1px" borderColor="border.subtle" px={8} pt={8} pb={6} textAlign="center">
          <Box h={12} display="flex" alignItems="center" justifyContent="center" mx="auto" mb={4}>
            <Image src={displayLogo} alt="Inspect-able" maxH={10} objectFit="contain" />
          </Box>
          <Heading size="xl" fontWeight="black" color="fg" mb={1}>Inspect-able</Heading>
          <Text color="fg.muted" fontSize="xs" fontWeight="medium">Sign in to access the inspection board</Text>
        </Card.Header>

        <Card.Body p={6}>
          <VStack gap={3}>
            <a
              href={googleUrl}
              className="flex items-center justify-center gap-3 w-full py-3 px-4 bg-white border-2 border-slate-200 rounded-2xl text-sm font-black text-slate-700 no-underline cursor-pointer transition-all shadow-sm hover:border-indigo-400 hover:bg-indigo-50 active:scale-95"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </a>
            <Text fontSize="2xs" textAlign="center" color="fg.muted" fontWeight="medium">
              @poliku.edu.my accounts only · via auth.inspect-able.com
            </Text>
          </VStack>
        </Card.Body>
      </Card.Root>

      <Text mt={6} fontSize="2xs" color="fg.muted" fontWeight="medium" textAlign="center">
        Politeknik Kuching Sarawak · Asset Inspection System
      </Text>
    </Flex>
  );
};
