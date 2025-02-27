import { generateClient } from "aws-amplify/data";
import { Schema } from "@/amplify/data/resource";
import { useUser } from "../../UserContext";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Skeleton from "@/app/ui/Skeleton";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import DownloadTamperMonekyScript from "./downloadTamperMonkeyScript";
import StatusUpdate from "./statusUpdate";
import config from "@/amplify_outputs.json";
import { fetchAuthSession } from "aws-amplify/auth";
import { useEffect, useState } from "react";

function sortByCreationDate(array: any) {
  return array.sort((a: any, b: any) => {
    const dateA = new Date(a.createdAt);
    const dateB = new Date(b.createdAt);
    if (dateA > dateB) return -1;
    if (dateA < dateB) return 1;
    return 0;
  });
}

export default function QChatListRequests({
  onNewFormRequest,
}: {
  onNewFormRequest: any;
}) {
  const client = generateClient<Schema>();
  const queryClient = useQueryClient();
  const { isAdmin, emailId } = useUser();
  const [userSpecificView, setUserSpecificView] = useState(!isAdmin);
  const [isProcessing, setIsProcessing] = useState(false);

  const [totalIndexedPages, setTotalIndexedPages] = useState(0);

  const { data: submissions, isFetching } = useQuery<Schema["QChatRequest"][]>({
    queryKey: ["listQChatRequests"],
    queryFn: () =>
      client.models.QChatRequest.list()
        .then((list) => list.data)
        .then((list) => list.filter((item) => item.bot_status != "Disabled" && (userSpecificView ? item.requester_email === emailId : true)))
        .then((list) => sortByCreationDate(list)),
  });

  useEffect(() => {
    if (submissions === null || submissions === undefined) return;
    let total = 0;
    /*
    for (const submission of submissions) {
      if (submission.indexedPages && parseInt(submission.indexedPages, 10) > 0) {
        total += parseInt(submission.indexedPages, 10);
      }
    } */
    getTotalKendraIndexedDocs();
  }, [submissions]);

  /* if (isFetching) return <Skeleton />; */

  async function refreshIndexingStatus(submission: any) {
    try {
      const { idToken } = (await fetchAuthSession()).tokens ?? {};
      const endpoint_url = (config as any).custom.apiExecuteStepFnEndpoint;
      const client = generateClient<Schema>();

      var isOwner = false;
      emailId === submission.requester_email ? (isOwner = true) : "";

      if (
        /* !isAdmin && !isOwner &&  */ submission.indexedPages &&
        parseInt(submission.indexedPages, 10) > 0
      )
        return;

      const requestOptions: any = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: idToken,
        },
        body: JSON.stringify({
          type: "getIndexingStatus",
          content: {
            regionQ: submission.regionQ,
            applicationIdQ: submission.applicationIdQ,
          },
        }),
      };

      const response = await fetch(
        `${endpoint_url}executeCommand`,
        requestOptions
      );
      const data = await response.json();
      const indexedPages = data.indexedPages;

      if (indexedPages > 0) {
        const respValue = await client.models.QChatRequest.update({
          indexedPages: indexedPages,
          id: submission.id,
        });
      }
    } catch (err) {
      console.log(err);
    }
  }

  async function getTotalKendraIndexedDocs() {
    try {
      const { idToken } = (await fetchAuthSession()).tokens ?? {};
      const endpoint_url = (config as any).custom.apiExecuteStepFnEndpoint;
      const client = generateClient<Schema>();

      const requestOptions: any = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: idToken,
        },
        body: JSON.stringify({
          type: "getTotalKendraIndexedDocs",
          content: {},
        }),
      };

      const response = await fetch(
        `${endpoint_url}executeCommand`,
        requestOptions
      );
      const data = await response.json();
      const totalPages = data.totalKendraIndexedDocs;

      setTotalIndexedPages(totalPages / 1000);
    } catch (err) {
      console.log(err);
    }
  }

  async function handleIndexedPageStatusRefresh() {
    try {
      if (submissions === null || submissions === undefined) return;
      setIsProcessing(true);
      for (const submission of submissions) {
        await refreshIndexingStatus(submission);
      }
      queryClient.invalidateQueries({ queryKey: ["listQChatRequests"] });
      setIsProcessing(false);
    } catch (err) {
      setIsProcessing(false);
      console.log(err);
    }
  }

  return (
    <main>
      <Button className="m-4 text-xl" onClick={() => onNewFormRequest()}>
        {" "}
        + Create New Request ☞
      </Button>
      <div className="flex justify-between items-center mb-4">
        <div className="flex text-xl">List of Submitted Forms</div>
        <div className="flex items-center">
          {isAdmin && (
            <Button
              className="mr-4"
              onClick={() => setUserSpecificView(!userSpecificView)}
            >
              {userSpecificView ? "Show All Requests" : "Show My Requests"}
            </Button>
          )}
          <div className="text-md">
            Ongoing PoCs: {submissions?.length}, Indexing Consumption:{" "}
            {totalIndexedPages ? Math.round(totalIndexedPages) : 0}k / 100K
            {totalIndexedPages > 10 && (
              <div className="text-red-500 font-bold">
                Warning: Indexing limit has been increased!
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="">
        <Table>
          <TableCaption>Recently submitted QChat Requests</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Customer Name</TableHead>
              <TableHead className="w-[200px]">Website URL</TableHead>
              <TableHead>Requested By</TableHead>
              <TableHead>Creation Date</TableHead>
              <TableHead className="w-[300px]">
                Status (Indexed Pages)
                <Button variant="link" onClick={handleIndexedPageStatusRefresh}>
                  <ArrowPathIcon
                    className={`h-4 ${isProcessing ? "animate-spin" : ""}`}
                  />
                </Button>
              </TableHead>
              <TableHead className="flex p-4 font-bold">
                ChatBot {<ArrowTopRightOnSquareIcon className="h-4 pl-2" />}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submissions?.map((item: any) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.customer}</TableCell>
                <TableCell className="truncate sm:max-w-24 md:max-w-48">
                  {item.website}
                </TableCell>
                <TableCell>{item.requester_email}</TableCell>
                <TableCell>
                  {new Date(item.updatedAt).toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  <StatusUpdate item={item} />
                </TableCell>
                <TableCell>
                  {item.token ? (
                    <>
                      <Link
                        href={item.token.includes("?id=") ? item.token : ""}
                        target="_blank"
                        className="text-blue-500 underline hover:text-purple-500"
                      >
                        {item.chatbotname}
                        <ArrowTopRightOnSquareIcon className="h-4 pl-2 inline-flex" />
                      </Link>
                      <DownloadTamperMonekyScript
                        domainName={new URL(item.website).hostname}
                        chatbotURL={item.token}
                        customerName={item.customer}
                      />
                    </>
                  ) : (
                    item.chatbotname
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {/* <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>Total</TableCell>
          <TableCell className="text-right">24</TableCell>
        </TableRow>
      </TableFooter> */}
        </Table>
      </div>
    </main>
  );
}
